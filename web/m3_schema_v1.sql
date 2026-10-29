-- M3: append-only model metadata and forecast evaluations.
CREATE TRIGGER IF NOT EXISTS tr_forecast_eval_immutable_update
  BEFORE UPDATE ON forecast_evaluations
  BEGIN SELECT RAISE(ABORT,'immutable forecast evaluation'); END;
CREATE TRIGGER IF NOT EXISTS tr_forecast_eval_immutable_delete
  BEFORE DELETE ON forecast_evaluations
  BEGIN SELECT RAISE(ABORT,'immutable forecast evaluation'); END;
CREATE TRIGGER IF NOT EXISTS tr_model_registry_immutable_update
  BEFORE UPDATE ON model_registry
  BEGIN SELECT RAISE(ABORT,'immutable model registry record'); END;
CREATE TRIGGER IF NOT EXISTS tr_model_registry_immutable_delete
  BEFORE DELETE ON model_registry
  BEGIN SELECT RAISE(ABORT,'immutable model registry record'); END;
