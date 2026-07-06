module Api
  # Public health/readiness endpoint. Reports app liveness and DB connectivity.
  # Intentionally requires no authentication (see spec §3, §9).
  class HealthController < ApplicationController
    def show
      db_ok =
        begin
          ActiveRecord::Base.connection.execute("SELECT 1")
          true
        rescue StandardError
          false
        end

      render json: {
        status: db_ok ? "ok" : "degraded",
        service: "task_managing_system-api",
        database: db_ok ? "up" : "down",
        time: Time.now.utc.iso8601,
      }, status: db_ok ? :ok : :service_unavailable
    end
  end
end
