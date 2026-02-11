# ------------------------------------------------------------------------------
# Terraform Backend Configuration - Local State
#
# For now, using local state. State file will be at:
#   infra/terraform/environments/staging/terraform.tfstate
#
# TODO: Migrate to R2 backend for team collaboration:
#
# terraform {
#   backend "s3" {
#     bucket                      = "sabaipics-terraform-state"
#     key                         = "cloudflare/staging.tfstate"
#     region                      = "auto"
#     skip_credentials_validation = true
#     skip_metadata_api_check     = true
#     skip_region_validation      = true
#     skip_requesting_account_id  = true
#     skip_s3_checksum            = true
#     endpoints = {
#       s3 = "https://ac76d647241fb6b589f88fe88d0e4a08.r2.cloudflarestorage.com"
#     }
#   }
# }
# ------------------------------------------------------------------------------

# Using local backend (default) - no configuration needed
