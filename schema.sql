-- Database schema for PMO Tracking Application

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('ADMIN', 'DM', 'PM', 'IRM')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sheets table
CREATE TABLE sheets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Columns table
CREATE TABLE columns (
    id SERIAL PRIMARY KEY,
    sheet_id INTEGER REFERENCES sheets(id) ON DELETE CASCADE,
    column_name VARCHAR(255) NOT NULL,
    editable_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
    UNIQUE(sheet_id, column_name)
);

-- Cells table
CREATE TABLE cells (
    id SERIAL PRIMARY KEY,
    sheet_id INTEGER REFERENCES sheets(id) ON DELETE CASCADE,
    row_index INTEGER NOT NULL,
    column_name VARCHAR(255) NOT NULL,
    value TEXT,
    UNIQUE(sheet_id, row_index, column_name)
);

-- Indexes for performance
CREATE INDEX idx_sheets_created_by ON sheets(created_by);
CREATE INDEX idx_columns_sheet_id ON columns(sheet_id);
CREATE INDEX idx_cells_sheet_id ON cells(sheet_id);
CREATE INDEX idx_cells_sheet_row ON cells(sheet_id, row_index);