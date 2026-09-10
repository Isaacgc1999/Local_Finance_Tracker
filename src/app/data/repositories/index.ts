import type { DatabaseHandle } from '../db/database';
import { AiReportsRepository } from './ai-reports.repository';
import { BudgetsRepository } from './budgets.repository';
import { CategoriesRepository } from './categories.repository';
import { EventsRepository } from './events.repository';
import { RecurrencesRepository } from './recurrences.repository';
import { SettingsRepository } from './settings.repository';

export interface Repositories {
  readonly events: EventsRepository;
  readonly recurrences: RecurrencesRepository;
  readonly categories: CategoriesRepository;
  readonly aiReports: AiReportsRepository;
  readonly settings: SettingsRepository;
  readonly budgets: BudgetsRepository;
}

export function createRepositories(db: DatabaseHandle): Repositories {
  return {
    events: new EventsRepository(db),
    recurrences: new RecurrencesRepository(db),
    categories: new CategoriesRepository(db),
    aiReports: new AiReportsRepository(db),
    settings: new SettingsRepository(db),
    budgets: new BudgetsRepository(db),
  };
}

export {
  AiReportsRepository,
  BudgetsRepository,
  CategoriesRepository,
  EventsRepository,
  RecurrencesRepository,
  SettingsRepository,
};
