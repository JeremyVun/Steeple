variable "STEEPLE_WEB_VERSION" { default = "latest"  }
variable "STEEPLE_API_VERSION" { default = "latest"  }
variable "STEEPLE_ADMIN_VERSION" { default = "latest"  }
variable "GOOGLE_CLIENT_ID" { default = "" }
variable "APPLE_SERVICES_ID" { default = "" }
variable "APPLE_REDIRECT_URI" { default = "" }
variable "TURNSTILE_MODE" { default = "" }
variable "TURNSTILE_SITE_KEY" { default = "" }

# Only targets whose projects exist today are in the default group, so a bare
# `docker buildx bake` works. The steeple-edge target is defined below but
# excluded here until that project and Dockerfile exist.
group "default" {
  targets = [
    "steeple-admin",
    "steeple-api",
    "steeple-web"
  ]
}

target "steeple-web" {
  context = "."
  dockerfile = "src/Steeple.Web.v2/Dockerfile"
  platforms = ["linux/amd64"]
  args = {
    VITE_GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID
    VITE_APPLE_CLIENT_ID = APPLE_SERVICES_ID
    VITE_APPLE_REDIRECT_URI = APPLE_REDIRECT_URI
    VITE_TURNSTILE_MODE = TURNSTILE_MODE
    VITE_TURNSTILE_SITE_KEY = TURNSTILE_SITE_KEY
  }
  tags = [
    "registry.jeremyvun.com/steeple-web:${STEEPLE_WEB_VERSION}",
    "registry.jeremyvun.com/steeple-web:latest"
  ]
}

target "steeple-api" {
  context = "."
  dockerfile = "src/Steeple.Api/Dockerfile"
  platforms = ["linux/amd64"]
  tags = [
    "registry.jeremyvun.com/steeple-api:${STEEPLE_API_VERSION}",
    "registry.jeremyvun.com/steeple-api:latest"
  ]
}

target "steeple-admin" {
  context = "."
  dockerfile = "src/Steeple.Admin/Dockerfile"
  platforms = ["linux/amd64"]
  tags = [
    "registry.jeremyvun.com/steeple-admin:${STEEPLE_ADMIN_VERSION}",
    "registry.jeremyvun.com/steeple-admin:latest"
  ]
}
