# frozen_string_literal: true

require "rails_helper"

RSpec.configure do |config|
  # Root folder where generated OpenAPI files are written; rswag-api serves from
  # the same location (see config/initializers/rswag_api.rb).
  config.openapi_root = Rails.root.join("swagger").to_s

  config.openapi_specs = {
    "v1/swagger.yaml" => {
      openapi: "3.0.1",
      info: {
        title: "Ticket Tracker API",
        version: "v1",
        description: "Authentication (M1) endpoints. Session is a signed " \
          "HttpOnly SameSite=Lax cookie; writes require an X-CSRF-Token header " \
          "matching the csrf_token cookie plus a permitted Origin.",
      },
      paths: {},
      components: {
        securitySchemes: {
          session_cookie: {
            type: :apiKey,
            in: :cookie,
            name: "session",
          },
        },
      },
      servers: [
        {
          url: "{scheme}://{host}",
          variables: {
            scheme: { default: "http" },
            host: { default: "localhost:8080" },
          },
        },
      ],
    },
  }

  config.openapi_format = :yaml
end
