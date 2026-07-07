# frozen_string_literal: true

# Base controller for the JSON API. Even in api_only mode we opt back into
# cookies (the session + CSRF cookies) and layer on authentication + CSRF/Origin
# protection. Every controller is gated by default; public actions opt out with
# `allow_unauthenticated_access`.
class ApplicationController < ActionController::API
  include ActionController::Cookies
  include ErrorRendering
  include RequestForgeryProtection
  include Authentication
end
