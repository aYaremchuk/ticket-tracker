# frozen_string_literal: true

module Api
  # GET /api/me — returns the current user (or null) so the SPA can restore
  # session state on load. This is a "who am I" probe: it is intentionally
  # PUBLIC and always returns 200 — `{ "user": {id,email} }` when a valid
  # verified session exists, or `{ "user": null }` when logged out. Returning
  # 200 (instead of 401) avoids a benign error in the browser console on every
  # unauthenticated page load.
  class CurrentUserController < ApplicationController
    allow_unauthenticated_access

    def show
      session = find_session_from_cookie
      user = session&.user
      user = nil unless user&.verified?

      render(json: { user: user ? UserSerializer.call(user) : nil }, status: :ok)
    end
  end
end
