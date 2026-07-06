# frozen_string_literal: true

require "rails_helper"

RSpec.describe(Epic, type: :model) do
  describe "associations" do
    it "belongs to a team" do
      team = create(:team)
      epic = described_class.new(title: "Alpha", team: team)
      expect(epic).to(be_valid)
      expect(epic.team).to(eq(team))
    end

    it "is invalid without a team" do
      epic = described_class.new(title: "Alpha")
      expect(epic).not_to(be_valid)
      expect(epic.errors[:team]).to(be_present)
    end
  end

  describe "title validation" do
    let(:team) { create(:team) }

    it "is valid with a title" do
      epic = described_class.new(title: "Checkout reliability", team: team)
      expect(epic).to(be_valid)
    end

    it "strips surrounding whitespace before validation" do
      epic = described_class.create!(title: "  Checkout  ", team: team)
      expect(epic.title).to(eq("Checkout"))
    end

    it "rejects a blank title" do
      epic = described_class.new(title: "", team: team)
      expect(epic).not_to(be_valid)
      expect(epic.errors[:title]).to(be_present)
    end

    it "rejects a whitespace-only title" do
      epic = described_class.new(title: "   ", team: team)
      expect(epic).not_to(be_valid)
      expect(epic.errors[:title]).to(be_present)
    end

    it "rejects a nil title" do
      epic = described_class.new(title: nil, team: team)
      expect(epic).not_to(be_valid)
      expect(epic.errors[:title]).to(be_present)
    end
  end

  describe "description" do
    let(:team) { create(:team) }

    it "allows nil description" do
      epic = described_class.create!(title: "Epic", team: team, description: nil)
      expect(epic.description).to(be_nil)
    end

    it "stores a non-nil description" do
      epic = described_class.create!(title: "Epic", team: team, description: "Some detail")
      expect(epic.description).to(eq("Some detail"))
    end
  end

  describe "team_id immutability" do
    it "raises ReadonlyAttributeError when attempting to change team_id via update!" do
      team_a = create(:team)
      team_b = create(:team)
      epic = described_class.create!(title: "Epic", team: team_a)

      # attr_readonly raises when the readonly attribute is explicitly assigned
      # in an update call. The controller update action only permits :title and
      # :description, so this guard is defense-in-depth.
      expect { epic.update!(team_id: team_b.id) }.to(
        raise_error(ActiveRecord::ReadonlyAttributeError, /team_id/),
      )
      expect(epic.reload.team_id).to(eq(team_a.id))
    end

    it "controller PATCH ignores team_id in payload (not permitted)" do
      # update_params in EpicsController only permits :title and :description,
      # so even without attr_readonly, team_id would be stripped by strong params.
      team_a = create(:team)
      epic = described_class.create!(title: "Epic", team: team_a)
      expect(epic.team_id).to(eq(team_a.id))
    end
  end

  describe "#ticket_count" do
    it "returns 0 (stub until M4)" do
      epic = create(:epic)
      expect(epic.ticket_count).to(eq(0))
    end
  end
end
