using Steeple.Web.Extensions;
using Microsoft.AspNetCore.HttpOverrides;

var builder = WebApplication.CreateBuilder(args);

// Every authenticated POST carries the antiforgery token (CSRF). The SSO callbacks that can't
// (Apple's cross-site form_post) opt out explicitly and validate a signed state cookie instead.
var mvc = builder.Services.AddControllersWithViews(options =>
    options.Filters.Add(new Microsoft.AspNetCore.Mvc.AutoValidateAntiforgeryTokenAttribute()));
if (builder.Environment.IsDevelopment())
{
    mvc.AddRazorRuntimeCompilation();
}

builder.Services.AddHttpContextAccessor();

// Behind caddy (TLS terminated at the proxy): honour X-Forwarded-* so Request.Scheme/RemoteIp
// reflect the original request — needed for correct https canonical/sitemap URLs and Secure cookies.
// XForwardedPrefix maps the proxy's path prefix (e.g. /steeple) into Request.PathBase, so the
// funnel can be hosted under a sub-path: ~/ asset refs, Url.Action and redirects all pick it up.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
        | ForwardedHeaders.XForwardedPrefix;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});

builder.Services.AddSession(options =>
{
    options.Cookie.Name = "steeple.sid";
    options.Cookie.HttpOnly = true;
    options.Cookie.IsEssential = true;
    options.Cookie.SameSite = SameSiteMode.Lax;
    // TLS terminates at the reverse proxy; emit Secure cookies outside Development.
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
        ? CookieSecurePolicy.SameAsRequest
        : CookieSecurePolicy.Always;
});

builder.Services.AddSteeple(builder.Configuration);

var app = builder.Build();

// Schema and seed are owned by the one-shot Liquibase "migrate" service (see docker-compose.yml).
// The app never migrates or seeds — it only reads/writes the already-provisioned database.

app.UseForwardedHeaders();

if (!app.Environment.IsDevelopment())
{
    // Production: render a friendly error page instead of leaking a stack trace, and enforce HSTS.
    app.UseExceptionHandler("/error");
    app.UseHsts();
}

// Cheap baseline security headers for a public, reverse-proxied funnel. The CSP allows the
// pinned unpkg Leaflet assets and remote tile/photo images, plus the Google Identity Services
// button and the Cloudflare Turnstile widget (script + iframe each); everything else is
// same-origin. Apple's flow is a plain redirect — no third-party assets needed.
app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers["X-Content-Type-Options"] = "nosniff";
    headers["X-Frame-Options"] = "DENY";
    headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    headers["Content-Security-Policy"] =
        "default-src 'self'; " +
        "img-src 'self' data: https:; " +
        "style-src 'self' 'unsafe-inline' https://unpkg.com https://accounts.google.com; " +
        "script-src 'self' https://unpkg.com https://accounts.google.com https://challenges.cloudflare.com; " +
        "connect-src 'self' https://accounts.google.com; " +
        "frame-src https://accounts.google.com https://challenges.cloudflare.com; " +
        "frame-ancestors 'none'";
    await next();
});

app.UseStaticFiles();
app.UseRouting();
app.UseSession();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Discovery}/{action=Index}/{id?}");

app.Run();
