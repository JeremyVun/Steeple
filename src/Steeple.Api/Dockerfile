# syntax=docker/dockerfile:1
#
# Build context is the repo root (see docker-bake.hcl: context = ".").
# COPY paths below are therefore relative to the repo root, not this directory.

# ---- Build stage ----
FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS build
WORKDIR /src

# Copy the csproj graph first so restore caches independently of source.
COPY src/Steeple.Persistence/Steeple.Persistence.csproj src/Steeple.Persistence/
COPY src/Steeple.Api/Steeple.Api.csproj src/Steeple.Api/
RUN dotnet restore src/Steeple.Api/Steeple.Api.csproj

COPY src/Steeple.Persistence/ src/Steeple.Persistence/
COPY src/Steeple.Api/ src/Steeple.Api/
RUN dotnet publish src/Steeple.Api/Steeple.Api.csproj \
    -c Release -o /app --no-restore -p:UseAppHost=false

# ---- Runtime stage ----
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache icu-libs tzdata

ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080

COPY --from=build /app .
USER $APP_UID
ENTRYPOINT ["dotnet", "Steeple.Api.dll"]
