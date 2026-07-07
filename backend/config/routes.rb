Rails.application.routes.draw do
  # Rails' built-in liveness check (boots with no exceptions).
  get "up" => "rails/health#show", as: :rails_health_check

  # Interactive API docs (OpenAPI spec generated from rswag request specs).
  # In production the UI *and* the raw spec are protected by HTTP Basic auth
  # (SWAGGER_USER / SWAGGER_PASSWORD). Fail-closed: if creds are not configured
  # in production, all credentials are rejected. Open in dev/test for QA.
  swagger_user = ENV["SWAGGER_USER"].to_s
  swagger_pass = ENV["SWAGGER_PASSWORD"].to_s
  # Protect the docs whenever credentials are configured, and ALWAYS in
  # production (fail-closed: if prod has no creds, every credential is rejected).
  protect_docs = swagger_user.present? && swagger_pass.present?
  protect_docs ||= Rails.env.production?

  docs_ui = Rswag::Ui::Engine
  docs_api = Rswag::Api::Engine
  if protect_docs
    swagger_auth = lambda do |user, password|
      next false if swagger_user.empty? || swagger_pass.empty? # fail closed

      Rack::Utils.secure_compare(user.to_s, swagger_user) &
        Rack::Utils.secure_compare(password.to_s, swagger_pass)
    end
    docs_ui = Rack::Auth::Basic.new(Rswag::Ui::Engine, "API Docs", &swagger_auth)
    docs_api = Rack::Auth::Basic.new(Rswag::Api::Engine, "API Docs", &swagger_auth)
  end
  mount docs_ui => "/api-docs"
  mount docs_api => "/api-docs"

  # Development-only inbox for captured verification emails.
  if Rails.env.development?
    mount LetterOpenerWeb::Engine, at: "/letter_opener"
  end

  # All application endpoints are served under /api (nginx proxies /api → here).
  namespace :api do
    # Public readiness/health endpoint (no auth).
    get "health" => "health#show"

    # --- Auth (M1) ---
    post "signup" => "registrations#create"
    post "verify_email" => "email_verifications#verify"
    post "resend_verification" => "email_verifications#resend"
    get "csrf" => "csrf#show"
    post "login" => "sessions#create"
    delete "logout" => "sessions#destroy"
    get "me" => "current_user#show"

    # --- Password reset (M6 stretch) ---
    post "password_reset" => "password_resets#create"
    post "password_reset/confirm" => "password_resets#confirm"

    # --- Teams (M2) ---
    resources :teams, only: [:index, :create, :update, :destroy]

    # --- Epics (M3) ---
    resources :epics, only: [:index, :create, :update, :destroy]

    # --- Tickets + Comments (M4) ---
    resources :tickets, only: [:index, :show, :create, :update, :destroy] do
      resources :comments, only: [:index, :create]
      resources :events, only: [:index], controller: "ticket_events"
    end

    # Comment edit/delete are addressed by their own id, not nested (M6 stretch).
    resources :comments, only: [:update, :destroy]
  end
end
