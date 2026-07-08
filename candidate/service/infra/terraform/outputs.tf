output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  value = aws_ecs_service.main.name
}

output "db_endpoint" {
  description = "RDS instance endpoint (host:port), not a connection string — no credentials included"
  value       = aws_db_instance.postgres.endpoint
}

output "database_url_parameter_name" {
  description = "SSM parameter name holding the full DATABASE_URL; fetch the value via `aws ssm get-parameter --with-decryption`, not via this output"
  value       = aws_ssm_parameter.database_url.name
}
