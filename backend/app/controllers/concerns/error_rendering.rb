# frozen_string_literal: true

# Centralizes the API error envelope required by docs/api-contract.md:
#   { "error": { "code", "message", "details?" } }
# Controllers call #render_error, or raise the standard exceptions below which
# are mapped to the correct status. Kept thin: controllers stay declarative.
module ErrorRendering
  extend ActiveSupport::Concern

  included do
    rescue_from ActiveRecord::RecordNotFound do
      render_error(code: "not_found", message: "Resource not found", status: :not_found)
    end

    rescue_from ActionController::ParameterMissing do |e|
      render_error(code: "bad_request", message: e.message, status: :bad_request)
    end
  end

  private

  def render_error(code:, message:, status:, details: nil)
    payload = { code: code, message: message }
    payload[:details] = details if details.present?
    render(json: { error: payload }, status: status)
  end

  # Renders a 422 from an ActiveModel/ActiveRecord errors object.
  def render_validation_errors(record, code: "validation_error")
    render_error(
      code: code,
      message: record.errors.full_messages.first || "Validation failed",
      status: :unprocessable_content,
      details: record.errors.to_hash(true),
    )
  end
end
