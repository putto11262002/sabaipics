# ------------------------------------------------------------------------------
# Terraform Backend Configuration - Cloudflare R2
#
# State is stored in the sabaipics-terraform-state R2 bucket using
# the S3-compatible API. Credentials (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)
# are injected via Infisical from the /terraform folder:
#
#   infisical run --env=dev --path="/terraform" -- terraform plan
#
# NOTE: R2 does not support state locking. Avoid concurrent applies.
# ------------------------------------------------------------------------------

terraform {
  backend "s3" {
    bucket                      = "framefast-tf-state"
    key                         = "cloudflare/dev.tfstate"
    region                      = "auto"
    endpoint                    = "https://ac76d647241fb6b589f88fe88d0e4a08.r2.cloudflarestorage.com"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    force_path_style            = true
  }
}
