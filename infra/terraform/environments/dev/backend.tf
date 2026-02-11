# ------------------------------------------------------------------------------
# Backend Configuration for Dev
# Using local state for now - can migrate to R2 backend later
# ------------------------------------------------------------------------------

# terraform {
#   backend "s3" {
#     bucket                      = "terraform-state"
#     key                         = "cloudflare/dev/terraform.tfstate"
#     region                      = "auto"
#     skip_credentials_validation = true
#     skip_metadata_api_check     = true
#     skip_region_validation      = true
#     skip_requesting_account_id  = true
#     skip_s3_checksum            = true
#     use_path_style              = true
#     endpoints = {
#       s3 = "https://<account_id>.r2.cloudflarestorage.com"
#     }
#   }
# }
