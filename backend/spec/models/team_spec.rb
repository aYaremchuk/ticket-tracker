# frozen_string_literal: true

require "rails_helper"

RSpec.describe(Team, type: :model) do
  describe "name validation" do
    it "is valid with a name" do
      team = described_class.new(name: "Payments")
      expect(team).to(be_valid)
    end

    it "strips surrounding whitespace before validation" do
      team = described_class.create!(name: "  Payments  ")
      expect(team.name).to(eq("Payments"))
    end

    it "rejects a blank name" do
      team = described_class.new(name: "")
      expect(team).not_to(be_valid)
      expect(team.errors[:name]).to(be_present)
    end

    it "rejects a whitespace-only name" do
      team = described_class.new(name: "   ")
      expect(team).not_to(be_valid)
      expect(team.errors[:name]).to(be_present)
    end

    it "rejects a nil name" do
      team = described_class.new(name: nil)
      expect(team).not_to(be_valid)
      expect(team.errors[:name]).to(be_present)
    end

    it "enforces case-insensitive uniqueness at the model level" do
      described_class.create!(name: "Payments")
      dup = described_class.new(name: "PAYMENTS")
      expect(dup).not_to(be_valid)
      expect(dup.errors.of_kind?(:name, :taken)).to(be(true))
    end

    it "allows teams with different names" do
      described_class.create!(name: "Team Alpha")
      other = described_class.new(name: "Team Beta")
      expect(other).to(be_valid)
    end
  end

  describe "counts (pre-M3/M4 defaults)" do
    subject(:team) { create(:team) }

    it "ticket_count returns 0" do
      expect(team.ticket_count).to(eq(0))
    end

    it "epic_count returns 0" do
      expect(team.epic_count).to(eq(0))
    end
  end

  describe "#deletable?" do
    it "returns true before M3/M4 tables exist" do
      expect(create(:team).deletable?).to(be(true))
    end
  end
end
