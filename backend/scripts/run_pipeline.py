#!/usr/bin/env python3
"""
Orchestrate the full data pipeline from CSV to validated frontend data.

This script runs:
1. parse_csv.py - Parse Price.csv into raw JSON
2. normalize.py - Normalize pricing data
3. validate_output.py - Validate output matches frontend schemas
4. Copy data to frontend

Exits with code 1 on any failure.
"""
import logging
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import List, Tuple

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class PipelineError(Exception):
    """Pipeline execution error"""
    pass


class PipelineStep:
    """Represents a single pipeline step"""
    
    def __init__(self, name: str, script_path: Path, description: str = ""):
        self.name = name
        self.script_path = script_path
        self.description = description
        self.start_time = None
        self.end_time = None
        self.success = False
        self.output = ""
        self.error = ""
    
    def run(self) -> bool:
        """Execute the pipeline step"""
        logger.info(f"{'=' * 60}")
        logger.info(f"Step: {self.name}")
        if self.description:
            logger.info(f"  {self.description}")
        logger.info(f"{'=' * 60}")
        
        self.start_time = datetime.now()
        
        try:
            result = subprocess.run(
                [sys.executable, str(self.script_path)],
                capture_output=True,
                text=True,
                cwd=str(self.script_path.parent.parent)
            )
            
            self.output = result.stdout
            self.error = result.stderr
            
            if result.returncode != 0:
                logger.error(f"Step '{self.name}' failed with exit code {result.returncode}")
                if self.error:
                    logger.error(f"Error output:\n{self.error}")
                return False
            
            self.success = True
            self.end_time = datetime.now()
            duration = (self.end_time - self.start_time).total_seconds()
            logger.info(f"Step '{self.name}' completed in {duration:.2f}s")
            return True
            
        except Exception as e:
            logger.error(f"Step '{self.name}' failed with exception: {e}")
            self.error = str(e)
            return False


def copy_data_to_frontend(project_root: Path) -> bool:
    """Copy normalized data to frontend directory"""
    logger.info(f"{'=' * 60}")
    logger.info("Step: Copy data to frontend")
    logger.info(f"{'=' * 60}")
    
    start_time = datetime.now()
    
    # Source and destination paths
    frontend_data_dir = project_root / 'front' / 'src' / 'data'
    frontend_data_dir.mkdir(parents=True, exist_ok=True)
    
    # Files to copy (from normalize.py output)
    source_files = {
        'providers.json': frontend_data_dir / 'providers.json',
        'pricing.json': frontend_data_dir / 'pricing.json',
    }
    
    # Note: normalize.py already outputs to frontend, so we verify instead
    for filename, dest_path in source_files.items():
        if not dest_path.exists():
            logger.error(f"Expected file not found: {dest_path}")
            return False
        logger.info(f"  Verified: {dest_path}")
    
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()
    logger.info(f"Data verification completed in {duration:.2f}s")
    return True


def validate_data(project_root: Path) -> bool:
    """Run validation step"""
    logger.info(f"{'=' * 60}")
    logger.info("Step: Validate output")
    logger.info(f"{'=' * 60}")
    
    start_time = datetime.now()
    
    validate_script = project_root / 'backend' / 'scripts' / 'validate_output.py'
    
    if not validate_script.exists():
        logger.error(f"Validation script not found: {validate_script}")
        return False
    
    try:
        result = subprocess.run(
            [sys.executable, str(validate_script)],
            capture_output=True,
            text=True,
            cwd=str(project_root)
        )
        
        if result.returncode != 0:
            logger.error("Validation failed")
            if result.stderr:
                logger.error(f"Error output:\n{result.stderr}")
            return False
        
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        logger.info(f"Validation passed in {duration:.2f}s")
        return True
        
    except Exception as e:
        logger.error(f"Validation failed with exception: {e}")
        return False


def run_pipeline(project_root: Path, skip_validation: bool = False) -> Tuple[bool, List[PipelineStep]]:
    """
    Run the complete data pipeline.
    
    Args:
        project_root: Root directory of the project
        skip_validation: If True, skip the validation step
    
    Returns:
        Tuple of (success, steps)
    """
    scripts_dir = project_root / 'backend' / 'scripts'
    
    # Define pipeline steps
    steps = [
        PipelineStep(
            "Parse CSV",
            scripts_dir / 'parse_csv.py',
            "Extract provider and pricing data from Price.csv"
        ),
        PipelineStep(
            "Normalize Data",
            scripts_dir / 'normalize.py',
            "Calculate min/max prices and add metadata"
        ),
    ]
    
    if not skip_validation:
        steps.append(
            PipelineStep(
                "Validate Output",
                scripts_dir / 'validate_output.py',
                "Ensure data matches frontend Zod schemas"
            )
        )
    
    # Run each step
    for step in steps:
        if not step.run():
            return False, steps
    
    # Verify data is in frontend (normalize.py already copies it)
    if not copy_data_to_frontend(project_root):
        return False, steps
    
    return True, steps


def print_summary(success: bool, steps: List[PipelineStep], total_time: float):
    """Print pipeline execution summary"""
    logger.info("")
    logger.info("=" * 60)
    logger.info("PIPELINE SUMMARY")
    logger.info("=" * 60)
    
    for step in steps:
        status = "PASSED" if step.success else "FAILED"
        duration = 0.0
        if step.start_time and step.end_time:
            duration = (step.end_time - step.start_time).total_seconds()
        logger.info(f"  {step.name:20} {status:10} ({duration:.2f}s)")
    
    logger.info("-" * 60)
    overall_status = "SUCCESS" if success else "FAILED"
    logger.info(f"  {'Total':20} {overall_status:10} ({total_time:.2f}s)")
    logger.info("=" * 60)
    
    if not success:
        logger.error("")
        logger.error("Pipeline failed. Please fix the errors above and retry.")
        logger.error("For detailed error output, run individual scripts directly:")
        logger.error("  python backend/scripts/parse_csv.py")
        logger.error("  python backend/scripts/normalize.py")
        logger.error("  python backend/scripts/validate_output.py")


def main():
    """Main execution"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Run the ProxyPrice data pipeline"
    )
    parser.add_argument(
        '--skip-validation',
        action='store_true',
        help='Skip the validation step (useful for development)'
    )
    parser.add_argument(
        '--project-root',
        type=Path,
        default=None,
        help='Project root directory (default: auto-detect)'
    )
    
    args = parser.parse_args()
    
    # Detect project root
    if args.project_root:
        project_root = args.project_root
    else:
        project_root = Path(__file__).parent.parent.parent
    
    logger.info(f"Project root: {project_root}")
    logger.info("")
    
    start_time = datetime.now()
    
    # Run pipeline
    success, steps = run_pipeline(
        project_root,
        skip_validation=args.skip_validation
    )
    
    end_time = datetime.now()
    total_time = (end_time - start_time).total_seconds()
    
    # Print summary
    print_summary(success, steps, total_time)
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
