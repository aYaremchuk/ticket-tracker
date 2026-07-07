# frozen_string_literal: true

module Api
  # Public endpoints for the password-reset flow:
  #   POST /api/password_reset          — request a reset link (always 202, no
  #                                       account enumeration).
  #   POST /api/password_reset/confirm  — consume a token and set a new password.
  class PasswordResetsController < ApplicationController
    allow_unauthenticated_access

    # POST /api/password_reset { email } -> 202 always.
    def create
      user = User.find_by(email: params[:email].to_s.strip.downcase)

      # Only existing accounts actually get an email; the response is identical
      # either way to avoid leaking whether an account exists.
      if user
        token = PasswordResetToken.issue!(user)
        UserMailer.password_reset_email(user, token.raw_token).deliver_later
      end

      render(
        json: { message: "If the account exists, a password reset email was sent." },
        status: :accepted,
      )
    end

    # POST /api/password_reset/confirm { token, password } -> 200 / 410 / 422.
    def confirm
      result = PasswordResetService.call(
        token: params[:token],
        password: params[:password].to_s,
      )

      if result.success?
        return render(json: { message: "Password has been reset." }, status: :ok)
      end

      case result.error_code
      when "token_invalid"
        render_error(
          code: "token_invalid",
          message: "This password reset link is expired or invalid",
          status: :gone,
        )
      else
        render_validation_errors(result.record)
      end
    end
  end
end
