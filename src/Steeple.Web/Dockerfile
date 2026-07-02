# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS build
WORKDIR /src
# Pure frontend: shares no project with the server (talks to the API over HTTP). Self-contained.
COPY src/Steeple.Web/Steeple.Web.csproj src/Steeple.Web/
RUN dotnet restore src/Steeple.Web/Steeple.Web.csproj

COPY src/Steeple.Web/ src/Steeple.Web/
RUN dotnet publish src/Steeple.Web/Steeple.Web.csproj \
    -c Release -o /app --no-restore -p:UseAppHost=false

# ---- Runtime stage ----
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache icu-libs tzdata

ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080

COPY --from=build /app .
USER $APP_UID
ENTRYPOINT ["dotnet", "Steeple.Web.dll"]
