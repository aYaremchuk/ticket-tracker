Rails.application.routes.draw do
  # Rails' built-in liveness check (boots with no exceptions).
  get "up" => "rails/health#show", as: :rails_health_check

  # All application endpoints are served under /api (nginx proxies /api → here).
  namespace :api do
    # Public readiness/health endpoint (no auth).
    get "health" => "health#show"
  end
end
