# ------------------------------------------------------------------------------
# Provider Requirements
# ------------------------------------------------------------------------------

terraform {
  required_version = ">= 1.0.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
    infisical = {
      source  = "Infisical/infisical"
      version = ">= 0.7.0"
    }
  }
}
