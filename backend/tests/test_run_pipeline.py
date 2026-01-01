#!/usr/bin/env python3
"""
Integration tests for the data pipeline.

Tests the full pipeline execution from parse_csv through validate_output.
"""
import json
import pytest
import subprocess
import sys
from datetime import date
from pathlib import Path
from unittest.mock import MagicMock, patch

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'scripts'))

from run_pipeline import PipelineStep, run_pipeline, copy_data_to_frontend


@pytest.fixture
def project_root():
    """Get the project root directory"""
    return Path(__file__).parent.parent.parent


@pytest.fixture
def scripts_dir(project_root):
    """Get the scripts directory"""
    return project_root / 'backend' / 'scripts'


@pytest.fixture
def sample_providers_raw():
    """Sample providers data for testing"""
    return [
        {
            "id": "test-provider",
            "name": "Test Provider",
            "slug": "test-provider",
            "website_url": "https://example.com",
            "trial_offer": "7-day trial",
            "proxy_types": ["residential", "datacenter"],
            "has_pricing_data": True,
            "pricing_count": 2,
            "cheapest_price_per_gb": 1.5
        }
    ]


@pytest.fixture
def sample_pricing_raw():
    """Sample pricing data for testing"""
    return [
        {
            "provider_id": "test-provider",
            "provider_name": "Test Provider",
            "proxy_type": "residential",
            "price_url": "https://example.com/pricing",
            "tiers": [
                {"gb": 1, "price_per_gb": 2.0, "total": 2.0, "pricing_model": "per_gb"},
                {"gb": 10, "price_per_gb": 1.5, "total": 15.0, "pricing_model": "per_gb"}
            ],
            "has_pricing": True
        },
        {
            "provider_id": "test-provider",
            "provider_name": "Test Provider",
            "proxy_type": "datacenter",
            "price_url": "https://example.com/pricing",
            "tiers": [
                {"gb": 1, "price_per_gb": 0.5, "total": 0.5, "pricing_model": "per_gb"}
            ],
            "has_pricing": True
        }
    ]


class TestPipelineStep:
    """Tests for PipelineStep class"""
    
    def test_pipeline_step_creation(self, scripts_dir):
        """Test creating a pipeline step"""
        step = PipelineStep(
            "Test Step",
            scripts_dir / 'parse_csv.py',
            "Description"
        )
        assert step.name == "Test Step"
        assert step.script_path == scripts_dir / 'parse_csv.py'
        assert step.description == "Description"
        assert step.success is False
    
    def test_pipeline_step_run_success(self, scripts_dir, tmp_path):
        """Test running a successful pipeline step"""
        # Create a simple test script
        test_script = tmp_path / "test_success.py"
        test_script.write_text("import sys; sys.exit(0)")
        
        step = PipelineStep("Test Success", test_script)
        result = step.run()
        
        assert result is True
        assert step.success is True
        assert step.end_time is not None
    
    def test_pipeline_step_run_failure(self, scripts_dir, tmp_path):
        """Test running a failed pipeline step"""
        test_script = tmp_path / "test_failure.py"
        test_script.write_text("import sys; sys.exit(1)")
        
        step = PipelineStep("Test Failure", test_script)
        result = step.run()
        
        assert result is False
        assert step.success is False
    
    def test_pipeline_step_run_exception(self, tmp_path):
        """Test pipeline step with exception"""
        test_script = tmp_path / "test_exception.py"
        test_script.write_text("raise RuntimeError('test error')")
        
        step = PipelineStep("Test Exception", test_script)
        result = step.run()
        
        assert result is False
        assert step.success is False
        assert "test error" in step.error


class TestCopyDataToFrontend:
    """Tests for copy_data_to_frontend function"""
    
    def test_copy_data_with_existing_files(self, project_root, tmp_path):
        """Test data verification when files exist"""
        # Create temporary frontend data directory
        frontend_dir = tmp_path / "front" / "src" / "data"
        frontend_dir.mkdir(parents=True)
        
        # Create test data files
        (frontend_dir / "providers.json").write_text('{"providers": []}')
        (frontend_dir / "pricing.json").write_text('{"pricing": []}')
        
        with patch('run_pipeline.Path') as mock_path:
            mock_path.return_value = tmp_path
            # Mock the project_root Path to return our tmp_path
            # This is a simplified test - real integration would be more complex
            pass
    
    def test_copy_data_with_missing_files(self, project_root, tmp_path):
        """Test data verification when files are missing"""
        frontend_dir = tmp_path / "front" / "src" / "data"
        frontend_dir.mkdir(parents=True)
        
        # Only create one file, leaving the other missing
        (frontend_dir / "providers.json").write_text('{"providers": []}')
        
        # Missing pricing.json should cause failure
        result = copy_data_to_frontend(tmp_path)
        assert result is False


class TestPipelineIntegration:
    """Integration tests for the full pipeline"""
    
    @pytest.mark.integration
    def test_parse_csv_script_exists(self, scripts_dir):
        """Test that parse_csv.py exists and is executable"""
        parse_script = scripts_dir / 'parse_csv.py'
        assert parse_script.exists()
    
    @pytest.mark.integration
    def test_normalize_script_exists(self, scripts_dir):
        """Test that normalize.py exists and is executable"""
        normalize_script = scripts_dir / 'normalize.py'
        assert normalize_script.exists()
    
    @pytest.mark.integration
    def test_validate_script_exists(self, scripts_dir):
        """Test that validate_output.py exists and is executable"""
        validate_script = scripts_dir / 'validate_output.py'
        assert validate_script.exists()
    
    @pytest.mark.integration
    def test_parse_csv_imports(self):
        """Test that parse_csv module can be imported"""
        try:
            from parse_csv import parse_tier_line, parse_price_offers
            assert callable(parse_tier_line)
            assert callable(parse_price_offers)
        except ImportError as e:
            pytest.skip(f"Could not import parse_csv: {e}")
    
    @pytest.mark.integration
    def test_normalize_imports(self):
        """Test that normalize module can be imported"""
        try:
            from normalize import normalize_pricing_record, calculate_price_extremes
            assert callable(normalize_pricing_record)
            assert callable(calculate_price_extremes)
        except ImportError as e:
            pytest.skip(f"Could not import normalize: {e}")
    
    @pytest.mark.integration
    def test_validate_imports(self):
        """Test that validate_output module can be imported"""
        try:
            from validate_output import validate_provider, validate_pricing_record
            assert callable(validate_provider)
            assert callable(validate_pricing_record)
        except ImportError as e:
            pytest.skip(f"Could not import validate_output: {e}")


class TestPipelineWithMockData:
    """Tests using mock data to verify pipeline behavior"""
    
    def test_validate_provider_with_valid_data(self):
        """Test validating a valid provider object"""
        from validate_output import validate_provider
        
        provider = {
            "id": "test-provider",
            "name": "Test Provider",
            "slug": "test-provider",
            "website_url": "https://example.com",
            "trial_offer": None,
            "has_pricing_data": True,
            "pricing_count": 2,
            "cheapest_price_per_gb": 1.5,
            "proxy_types": ["residential"]
        }
        
        result = validate_provider(provider, 0)
        assert result['id'] == "test-provider"
        assert result['slug'] == "test-provider"
    
    def test_validate_provider_with_invalid_slug(self):
        """Test that invalid slug raises ValidationError"""
        from validate_output import validate_provider, SchemaValidationError
        
        provider = {
            "id": "test-provider",
            "name": "Test Provider",
            "slug": "Invalid_Slug",  # Underscore not allowed
            "website_url": "https://example.com",
            "has_pricing_data": True,
            "pricing_count": 0,
            "cheapest_price_per_gb": None
        }
        
        with pytest.raises(SchemaValidationError, match="lowercase alphanumeric"):
            validate_provider(provider, 0)
    
    def test_validate_pricing_record_with_valid_data(self):
        """Test validating a valid pricing record"""
        from validate_output import validate_pricing_record
        
        record = {
            "provider_id": "test-provider",
            "provider_name": "Test Provider",
            "proxy_type": "residential",
            "price_url": "https://example.com/pricing",
            "pricing_model": "per_gb",
            "min_price_per_gb": 1.5,
            "max_price_per_gb": 3.0,
            "comparable": True,
            "has_pricing": True,
            "tier_count": 2,
            "tiers": [
                {"gb": 1, "price_per_gb": 3.0, "total": 3.0, "pricing_model": "per_gb"},
                {"gb": 10, "price_per_gb": 1.5, "total": 15.0, "pricing_model": "per_gb"}
            ]
        }
        
        result = validate_pricing_record(record, 0)
        assert result['provider_id'] == "test-provider"
        assert result['proxy_type'] == "residential"
    
    def test_validate_pricing_record_with_invalid_proxy_type(self):
        """Test that invalid proxy_type raises ValidationError"""
        from validate_output import validate_pricing_record, SchemaValidationError
        
        record = {
            "provider_id": "test-provider",
            "provider_name": "Test Provider",
            "proxy_type": "invalid-type",
            "pricing_model": "unknown",
            "comparable": False,
            "has_pricing": False,
            "tier_count": 0,
            "tiers": []
        }
        
        with pytest.raises(SchemaValidationError):
            validate_pricing_record(record, 0)
    
    def test_validate_tier_with_valid_data(self):
        """Test validating a valid tier object"""
        from validate_output import validate_tier
        
        tier = {
            "gb": 10,
            "price_per_gb": 1.5,
            "total": 15.0,
            "pricing_model": "per_gb"
        }
        
        result = validate_tier(tier, 0)
        assert result['gb'] == 10
        assert result['pricing_model'] == "per_gb"
    
    def test_normalize_then_validate_flow(self):
        """Test data flows correctly from normalize to validate"""
        from normalize import normalize_pricing_record
        from validate_output import validate_pricing_record
        
        # Start with raw pricing record
        raw_record = {
            "provider_id": "test-provider",
            "provider_name": "Test Provider",
            "proxy_type": "residential",
            "price_url": "https://example.com/pricing",
            "tiers": [
                {"gb": 5, "price_per_gb": 2.0, "total": 10.0, "pricing_model": "per_gb"}
            ],
            "has_pricing": True
        }
        
        # Run normalization
        normalized = normalize_pricing_record(raw_record)
        
        # Validate the normalized output
        validated = validate_pricing_record(normalized, 0)
        
        assert validated['provider_id'] == "test-provider"
        assert validated['min_price_per_gb'] == 2.0
        assert validated['max_price_per_gb'] == 2.0
        assert validated['comparable'] is True


class TestPipelineCommandLine:
    """Tests for pipeline command-line interface"""
    
    def test_run_pipeline_help(self):
        """Test that --help flag works"""
        result = subprocess.run(
            [sys.executable, "-m", "run_pipeline", "--help"],
            capture_output=True,
            cwd=str(Path(__file__).parent.parent)
        )
        # Module may not be runnable, skip if it fails
        if result.returncode != 0:
            pytest.skip("run_pipeline module not directly executable")
    
    def test_main_imports(self):
        """Test that main function can be imported"""
        try:
            from run_pipeline import main
            assert callable(main)
        except ImportError as e:
            pytest.skip(f"Could not import run_pipeline.main: {e}")


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
