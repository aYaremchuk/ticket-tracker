# frozen_string_literal: true

require "rails_helper"

RSpec.describe(Ticket, type: :model) do
  let(:team)  { create(:team) }
  let(:user)  { create(:user) }
  let(:valid_attrs) do
    {
      team: team,
      created_by: user,
      title: "Fix login bug",
      body: "Details here",
      ticket_type: "bug",
      state: "new",
    }
  end

  describe "validations" do
    it "is valid with all required fields" do
      ticket = described_class.new(valid_attrs)
      expect(ticket).to(be_valid)
    end

    it "is invalid without a title" do
      ticket = described_class.new(valid_attrs.merge(title: ""))
      expect(ticket).not_to(be_valid)
      expect(ticket.errors[:title]).to(be_present)
    end

    it "is invalid without a body" do
      ticket = described_class.new(valid_attrs.merge(body: ""))
      expect(ticket).not_to(be_valid)
      expect(ticket.errors[:body]).to(be_present)
    end

    it "strips surrounding whitespace from title" do
      ticket = described_class.create!(valid_attrs.merge(title: "  Bug  "))
      expect(ticket.title).to(eq("Bug"))
    end

    it "strips surrounding whitespace from body" do
      ticket = described_class.create!(valid_attrs.merge(body: "  Details  "))
      expect(ticket.body).to(eq("Details"))
    end

    it "is invalid with an unknown ticket_type" do
      ticket = described_class.new(valid_attrs.merge(ticket_type: "unknown"))
      expect(ticket).not_to(be_valid)
      expect(ticket.errors[:ticket_type]).to(be_present)
    end

    it "is invalid with an unknown state" do
      ticket = described_class.new(valid_attrs.merge(state: "unknown"))
      expect(ticket).not_to(be_valid)
      expect(ticket.errors[:state]).to(be_present)
    end

    it "accepts all valid ticket_types" do
      ["bug", "feature", "fix"].each do |t|
        ticket = described_class.new(valid_attrs.merge(ticket_type: t))
        expect(ticket.valid?).to(be(true))
      end
    end

    it "accepts all valid states" do
      ["new", "ready_for_implementation", "in_progress", "ready_for_acceptance", "done"].each do |s|
        ticket = described_class.new(valid_attrs.merge(state: s))
        expect(ticket.valid?).to(be(true))
      end
    end

    context "when validating epic_team relationship" do # rubocop:disable RSpec/MultipleMemoizedHelpers
      let(:other_team) { create(:team) }
      let(:epic)       { create(:epic, team: team) }
      let(:other_epic) { create(:epic, team: other_team) }

      it "is valid when epic belongs to the same team" do
        ticket = described_class.new(valid_attrs.merge(epic: epic))
        expect(ticket).to(be_valid)
      end

      it "is invalid (epic_team_mismatch) when epic belongs to a different team" do
        ticket = described_class.new(valid_attrs.merge(epic: other_epic))
        expect(ticket).not_to(be_valid)
        expect(ticket.errors.of_kind?(:epic_id, :epic_team_mismatch)).to(be(true))
      end

      it "is valid without an epic" do
        ticket = described_class.new(valid_attrs.merge(epic: nil))
        expect(ticket).to(be_valid)
      end

      it "raises epic_team_mismatch when changing team_id to a team the epic does not belong to" do
        ticket = described_class.create!(valid_attrs.merge(epic: epic))
        ticket.team_id = other_team.id
        # epic still belongs to the original team
        expect(ticket).not_to(be_valid)
        expect(ticket.errors.of_kind?(:epic_id, :epic_team_mismatch)).to(be(true))
      end
    end
  end

  describe "associations" do
    it "belongs to a team" do
      ticket = described_class.create!(valid_attrs)
      expect(ticket.team).to(eq(team))
    end

    it "belongs to a created_by user" do
      ticket = described_class.create!(valid_attrs)
      expect(ticket.created_by).to(eq(user))
    end

    it "has_many comments destroyed on destroy" do
      ticket = described_class.create!(valid_attrs)
      create(:comment, ticket: ticket)
      expect { ticket.destroy! }.to(change(Comment, :count).by(-1))
    end
  end

  describe "number auto-assignment" do
    it "assigns a positive integer number on create" do
      ticket = described_class.create!(valid_attrs)
      expect(ticket.number).to(be_a(Integer))
      expect(ticket.number).to(be > 0)
    end

    it "assigns unique numbers to successive tickets" do
      t1 = described_class.create!(valid_attrs)
      t2 = described_class.create!(valid_attrs.merge(title: "Another"))
      expect(t1.number).not_to(eq(t2.number))
    end
  end

  describe "modified_at semantics" do
    let(:ticket) { described_class.create!(valid_attrs) }

    it "sets modified_at on create" do
      expect(ticket.modified_at).to(be_present)
    end

    it "advances modified_at when title changes" do
      original = ticket.modified_at
      travel(1.second) do
        ticket.update!(title: "Changed title")
        expect(ticket.modified_at).to(be > original)
      end
    end

    it "advances modified_at when state changes" do
      original = ticket.modified_at
      travel(1.second) do
        ticket.update!(state: "in_progress")
        expect(ticket.modified_at).to(be > original)
      end
    end

    it "advances modified_at when body changes" do
      original = ticket.modified_at
      travel(1.second) do
        ticket.update!(body: "New body text")
        expect(ticket.modified_at).to(be > original)
      end
    end

    it "does NOT advance modified_at when updating with the same values" do
      ticket.reload
      original = ticket.modified_at
      travel(1.second) do
        # Explicitly assign the current values back — Rails still issues no
        # UPDATE (nothing dirty) and modified_at must not advance.
        ticket.update!(title: ticket.title)
        expect(ticket.reload.modified_at.to_i).to(eq(original.to_i))
      end
    end

    it "advances modified_at when team_id changes" do
      other_team = create(:team)
      original = ticket.modified_at
      travel(1.second) do
        ticket.update!(team_id: other_team.id)
        expect(ticket.modified_at).to(be > original)
      end
    end

    it "advances modified_at when epic_id changes" do
      epic = create(:epic, team: team)
      original = ticket.modified_at
      travel(1.second) do
        ticket.update!(epic_id: epic.id)
        expect(ticket.modified_at).to(be > original)
      end
    end

    it "does NOT advance modified_at when a comment is added" do
      ticket.reload
      original = ticket.modified_at
      travel(1.second) do
        create(:comment, ticket: ticket)
        expect(ticket.reload.modified_at.to_i).to(eq(original.to_i))
      end
    end
  end
end
