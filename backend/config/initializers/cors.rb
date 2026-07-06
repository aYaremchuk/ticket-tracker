# Be sure to restart your server when you modify this file.
#
# In the docker compose setup nginx proxies /api to this service, so the browser
# sees a single origin and CORS is not exercised. This block is here for local
# dev where the Vite dev server (e.g. http://localhost:5173) may call the API
# directly. Origins are configurable via CORS_ORIGINS (comma-separated); when
# unset, CORS middleware is not installed.
origins_env = ENV.fetch("CORS_ORIGINS", "").split(",").map(&:strip).reject(&:empty?)

if origins_env.any?
  Rails.application.config.middleware.insert_before 0, Rack::Cors do
    allow do
      origins(*origins_env)
      resource "*",
        headers: :any,
        expose: %w[Authorization],
        methods: %i[get post put patch delete options head]
    end
  end
end
