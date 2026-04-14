export const SHEET_CONSTANTS = {
  SVODKA_SHEET_NAME: 'Сводка',
  RANGES: {
    SVODKA: {
      CURRENT_MONTH: 'Сводка!D10',
      INITIAL_AMOUNT: 'Сводка!I8',
      EXPENSE_PLANNED: 'Сводка!D21',
      EXPENSE_ACTUAL: 'Сводка!D22',
      INCOME_PLANNED: 'Сводка!J21',
      INCOME_ACTUAL: 'Сводка!J22',
      EXPENSE_CATEGORIES: 'Сводка!B28:E45',
      INCOME_CATEGORIES: 'Сводка!H28:K45',
      EXPENSE_CATEGORY_LIST: 'Сводка!B28:B45',
      INCOME_CATEGORY_LIST: 'Сводка!H28:H45',
    },
    EXPENSE_HEADERS: ['Sana', 'Summa', 'Tavsif', 'Kategoriya'],
    INCOME_HEADERS: ['Sana', 'Tavsif', 'Kategoriya', 'Summa'],
  },
  MAX_ROWS_PER_REQUEST: 1000,
  START_ROW: 5,
} as const;
