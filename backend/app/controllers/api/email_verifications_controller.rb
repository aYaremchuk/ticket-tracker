# frozen_string_literal: true

module Api
  # Public endpoints for the email-verification flow:
  #   POST /api/verify_email       — consume a token, mark the user verified.
  #   POST /api/resend_verification — reissue + resend (always 202, no
  #                                   account enumeration).
  class EmailVerificationsController < ApplicationController
    allow_unauthenticated_access

    def verify
      token_value = params[:token]

      if token_value.blank?
        return render_error(
          code: "validation_error",
          message: "Token is required",
          status: :unprocessable_content,
        )
      end

      token = EmailVerificationToken.find_active(token_value)

      unless token
        return render_error(
          code: "token_invalid",
          message: "This verification link is expired or invalid",
          status: :gone,
        )
      end

      ActiveRecord::Base.transaction do
        token.user.verify!
        token.consume!
      end

      render(json: { message: "Email verified.", email: token.user.email }, status: :ok)
    end

    def resend
      user = User.find_by(email: params[:email].to_s.strip.downcase)

      # Only unverified, existing accounts actually get a new email; the response
      # is identical either way to avoid leaking whether an account exists.
      if user && !user.verified?
        token = EmailVerificationToken.issue!(user)
        UserMailer.verification_email(user, token.raw_token).deliver_later
      end

      render(
        json: {
          message: "If the account exists and is unverified, an email was sent.",
        },
        status: :accepted,
      )
    end
  end
end
