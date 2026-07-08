# DATABASE_URL is stored here (SecureString, default AWS-managed KMS
# key) rather than embedded as a plaintext task-definition environment
# variable — the same "don't leak sensitive values" posture the
# application itself applies to logs (see AppLogger's redaction).
resource "aws_ssm_parameter" "database_url" {
  name  = "/${var.project_name}/${var.environment}/DATABASE_URL"
  type  = "SecureString"
  value = "postgresql://${var.db_username}:${var.db_password}@${aws_db_instance.postgres.address}:5432/${var.db_name}"

  tags = local.common_tags
}
