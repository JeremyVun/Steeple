variable "STEEPLE_WEB_VERSION" { default = "latest"  }
variable "STEEPLE_API_VERSION" { default = "latest"  }
variable "STEEPLE_ADMIN_VERSION" { default = "latest"  }

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
  dockerfile = "src/Steeple.Web/Dockerfile"
  platforms = ["linux/amd64"]
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
