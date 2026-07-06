# frozen_string_literal: true

require "rails_helper"

RSpec.describe(Comment, type: :model) do
  let(:ticket) { create(:ticket) }
  let(:user)   { create(:user) }

  describe "validations" do
    it "is valid with all required fields" do
      comment = described_class.new(ticket: ticket, author: user, body: "A comment")
      expect(comment).to(be_valid)
    end

    it "is invalid without a body" do
      comment = described_class.new(ticket: ticket, author: user, body: "")
      expect(comment).not_to(be_valid)
      expect(comment.errors[:body]).to(be_present)
    end

    it "is invalid with whitespace-only body" do
      comment = described_class.new(ticket: ticket, author: user, body: "   ")
      expect(comment).not_to(be_valid)
    end

    it "strips whitespace from body" do
      comment = described_class.create!(ticket: ticket, author: user, body: "  Body  ")
      expect(comment.body).to(eq("Body"))
    end

    it "is invalid without a ticket" do
      comment = described_class.new(author: user, body: "Body")
      expect(comment).not_to(be_valid)
    end

    it "is invalid without an author" do
      comment = described_class.new(ticket: ticket, body: "Body")
      expect(comment).not_to(be_valid)
    end
  end

  describe "does not bump ticket modified_at" do
    it "adding a comment does not change the ticket modified_at" do
      t = create(:ticket)
      original = t.modified_at
      travel(2.seconds) do
        described_class.create!(ticket: t, author: user, body: "A comment")
        expect(t.reload.modified_at.to_i).to(eq(original.to_i))
      end
    end
  end
end
