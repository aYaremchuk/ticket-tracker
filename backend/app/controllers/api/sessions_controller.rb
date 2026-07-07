# frozen_string_literal: true

module Api
  # POST /api/login (public) and DELETE /api/logout (auth). Login verifies the
  # Argon2id password and email-verified status, then establishes a session
  # cookie. Logout destroys the session and clears the cookie.
  class SessionsController < ApplicationController
    allow_unauthenticated_access only: :create

    def create
      user = User.find_by(email: params[:email].to_s.strip.downcase)

      unless user&.authenticate(params[:password].to_s)
        return render_error(
          code: "invalid_credentials",
          message: "Invalid email or password",
          status: :unauthorized,
        )
      end

      unless user.verified?
        return render_error(
          code: "email_unverified",
          message: "Please verify your email before signing in",
          status: :forbidden,
        )
      end

      start_new_session_for(user)
      render(json: { user: UserSerializer.call(user) }, status: :ok)
    end

    def destroy
      terminate_session
      head(:no_content)
    end
  end
end
