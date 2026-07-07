# frozen_string_literal: true

require "rails_helper"

# Verifies that any endpoint receiving a syntactically invalid JSON body returns
# a clean 400 envelope instead of leaking a stack trace.
RSpec.describe("Malformed JSON handling", type: :request) do
  shared_examples "returns 400 bad_request for malformed JSON" do |method, path|
    it "responds with 400 and a bad_request envelope" do
      send(
        method,
        path,
        params: "{ not valid json",
        headers: { "Content-Type" => "application/json" },
      )
      expect(response).to(have_http_status(:bad_request))
      expect(response.parsed_body.dig("error", "code")).to(eq("bad_request"))
      expect(response.parsed_body.dig("error", "message")).to(eq("Malformed JSON in request body"))
    end
  end

  # CSRF-exempt public endpoint — easiest to hit without session setup.
  it_behaves_like "returns 400 bad_request for malformed JSON", :post, "/api/login"

  # A protected write endpoint; even before auth/CSRF checks, the parse error
  # must be caught and returned cleanly.
  it_behaves_like "returns 400 bad_request for malformed JSON", :post, "/api/signup"
end
