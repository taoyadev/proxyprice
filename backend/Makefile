.PHONY: help test test-cov test-watch lint clean validate pipeline pipeline-check all

# Default target
help:
	@echo "Available commands:"
	@echo "  make test         - Run all tests"
	@echo "  make test-cov     - Run tests with coverage report"
	@echo "  make test-watch   - Run tests in watch mode"
	@echo "  make lint         - Run linting on Python files"
	@echo "  make validate     - Run validation only (parse + normalize)"
	@echo "  make pipeline     - Run full data pipeline (parse + normalize + copy)"
	@echo "  make pipeline-check - Run pipeline with output validation"
	@echo "  make clean        - Remove cache and coverage files"
	@echo "  make all          - Run validation, tests, and linting"

# Run all tests
test:
	pytest tests/ -v

# Run tests with coverage
test-cov:
	pytest tests/ -v --cov=scripts --cov-report=term-missing --cov-report=html

# Run tests in watch mode
test-watch:
	pytest tests/ -v -f

# Lint Python files
lint:
	python -m py_compile scripts/*.py tests/*.py

# Run validation only (parse CSV + normalize)
validate:
	@echo "Running validation..."
	python3 scripts/parse_csv.py
	python3 scripts/normalize.py
	@echo "Validation complete!"

# Run full data pipeline (parse + normalize + copy to frontend)
pipeline:
	@echo "Running data pipeline..."
	python3 scripts/parse_csv.py
	python3 scripts/normalize.py
	@echo "Copying data to frontend..."
	cp ../data/raw/pricing_raw.json ../front/src/data/pricing.json
	cp ../data/raw/providers_raw.json ../front/src/data/providers.json
	@echo "Pipeline complete!"

# Run full pipeline with validation (fails if data is invalid)
pipeline-check:
	@echo "Running data pipeline with validation..."
	python3 scripts/run_pipeline.py
	@echo "Pipeline with validation complete!"

# Clean cache and coverage
clean:
	rm -rf .pytest_cache __pycache__ scripts/__pycache__ tests/__pycache__
	rm -rf htmlcov .coverage

# Run everything
all: validate test lint
	@echo "All checks passed!"
