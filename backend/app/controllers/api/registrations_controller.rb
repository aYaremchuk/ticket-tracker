# frozen_string_literal: true

module Api
  # POST /api/signup — public. Creates an unverified user and triggers the
  # verification email. Delegates business logic to SignupService.
  class RegistrationsController < ApplicationController
    allow_unauthenticated_access

    def create
      result = SignupService.call(
        email: params[:email],
        password: params[:password],
      )

      if result.success?
        render(json: { message: "Verification email sent." }, status: :created)
      elsif result.error_code == "email_taken"
        render_error(
          code: "email_taken",
          message: "Email already registered",
          status: :conflict,
        )
      else
        render_validation_errors(result.record)
      end
    end
  end
end
