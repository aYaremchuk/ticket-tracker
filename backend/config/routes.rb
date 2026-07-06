Rails.application.routes.draw do
  # Rails' built-in liveness check (boots with no exceptions).
  get "up" => "rails/health#show", as: :rails_health_check

  # Interactive API docs (OpenAPI spec generated from rswag request specs).
  mount Rswag::Ui::Engine => "/api-docs"
  mount Rswag::Api::Engine => "/api-docs"

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

    # --- Teams (M2) ---
    resources :teams, only: [:index, :create, :update, :destroy]

    # --- Epics (M3) ---
    resources :epics, only: [:index, :create, :update, :destroy]
  end
end
