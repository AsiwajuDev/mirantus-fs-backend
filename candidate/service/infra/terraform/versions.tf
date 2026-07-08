terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  # This module is plan-only (candidate/service/TASKS.md Phase 8) — it
  # is never applied, so `terraform plan` must succeed without real AWS
  # credentials. Without these, the provider's own init step calls STS
  # GetCallerIdentity before Terraform even reaches resource planning,
  # which fails immediately with fake/absent credentials.
  # Not a zero-cost workaround, though — per @code-reviewer:
  # `skip_credentials_validation` trades away an early fail-fast check
  # (a bad real credential now fails deeper into `apply`, possibly after
  # partially creating resources, rather than immediately at init), and
  # `skip_metadata_api_check` disables IMDS-based credential/region
  # discovery, which would break a real deployment run from an
  # EC2/ECS-hosted CI runner relying on an instance/task role rather
  # than static keys. Acceptable for a module that is genuinely never
  # applied, but worth reassessing before this graduates beyond
  # plan-only.
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
}
