variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

# Static list rather than a `data "aws_availability_zones"` lookup —
# this module must stay plan-able without live AWS API access (see
# candidate/service/TASKS.md Phase 8), which a data source would break.
# Not validated against var.aws_region — changing the region without
# updating this list will plan cleanly but fail at apply, since these
# AZ names are specific to us-east-1.
variable "availability_zones" {
  description = "AZs for the two subnets RDS's subnet group requires — must belong to var.aws_region"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "environment" {
  description = "Deployment environment name, used for resource naming/tagging"
  type        = string
  default     = "staging"
}

variable "project_name" {
  type    = string
  default = "mirantus-orders"
}

variable "container_image" {
  description = "Full ECR image URI (repository:tag) to run"
  type        = string
  default     = "PLACEHOLDER_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/mirantus-orders:latest"
}

variable "container_port" {
  type    = number
  default = 3000
}

variable "db_name" {
  type    = string
  default = "orders"
}

variable "db_username" {
  type    = string
  default = "postgres"
}

variable "db_password" {
  description = "Master password for RDS Postgres. Must be supplied via TF_VAR_db_password or a secrets manager — deliberately has no default. `sensitive = true` only redacts CLI/log output, not the state file or a committed default, so a real one is never placed here."
  type        = string
  sensitive   = true
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "frontend_origin" {
  description = "CORS-allowed origin for the deployed frontend"
  type        = string
  default     = "https://app.example.com"
}
