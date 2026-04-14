export interface FinanceRecord {
  id: string;
  date: string;
  amount: number;
  description: string;
  category: string;
  type: 'income' | 'expense';
  timestamp?: string;
  isPlanned?: boolean;
}

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense';
}

export interface SheetData {
  sheetName: string;
  headers: string[];
  rows: string[][];
}

export interface CategoryData {
  category: string;
  planned: number;
  actual: number;
  diff: number;
}

export interface SvodkaData {
  expensePlanned: number;
  expenseActual: number;
  incomePlanned: number;
  incomeActual: number;
  expenseCategories: CategoryData[];
  incomeCategories: CategoryData[];
}

export interface BudgetSummary {
  month: number;
  year: number;
  sheetName: string;
  initialAmount: number;
  endBalance: number;
  saved: number;
  savedPercent: string;
  expenses: {
    planned: number;
    actual: number;
    diff: number;
  };
  income: {
    planned: number;
    actual: number;
    diff: number;
  };
  expenseCategories: CategoryData[];
  incomeCategories: CategoryData[];
}
