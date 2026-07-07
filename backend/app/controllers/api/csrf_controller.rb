# frozen_string_literal: true

module Api
  # GET /api/csrf (public) — issues the double-submit CSRF token. The token is
  # returned in the body AND set as a readable SameSite=Lax cookie; the SPA
  # echoes it back in the X-CSRF-Token header on writes (see
  # RequestForgeryProtection).
  class CsrfController < ApplicationController
    allow_unauthenticated_access

    def show
      render(json: { csrf_token: issue_csrf_token }, status: :ok)
    end
  end
end
