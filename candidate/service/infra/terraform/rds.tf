resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db-subnets"
  subnet_ids = aws_subnet.public[*].id
  tags       = local.common_tags
}

resource "aws_db_instance" "postgres" {
  identifier     = "${var.project_name}-${var.environment}"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage = 20
  storage_type      = "gp3"

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]

  # SPEC.md §8: multi-region/HA deployments are explicitly out of scope
  # for this exercise — single-AZ is a deliberate scale-appropriate
  # choice, not an oversight.
  multi_az            = false
  publicly_accessible = false
  skip_final_snapshot = true # take-home scale only — a real deployment would not skip this

  tags = local.common_tags
}
