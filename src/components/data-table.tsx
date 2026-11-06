"use client";

import {
  columnFilteringFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  flexRender,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Inbox, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Feature registry shared by every admin data table (stable, module scope). */
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text, datetime: sortFn_datetime },
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- columns hold heterogeneous value types
export type DataTableColumn<TData extends RowData> = ColumnDef<typeof dataTableFeatures, TData, any>;

export function DataTable<TData extends RowData>({
  columns,
  data,
  searchText,
  searchPlaceholder = "Search…",
  emptyTitle = "Nothing here yet",
  emptyDescription,
  toolbar,
  pageSize = 20,
}: {
  columns: DataTableColumn<TData>[];
  data: TData[];
  /** Text the search box matches against for each row. */
  searchText: (row: TData) => string;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  toolbar?: React.ReactNode;
  pageSize?: number;
}) {
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, value: string) =>
      searchText(row.original).toLowerCase().includes(String(value).trim().toLowerCase()),
    getColumnCanGlobalFilter: () => true,
    initialState: { pagination: { pageIndex: 0, pageSize } },
  });

  const rows = table.getRowModel().rows;
  const filteredCount = table.getFilteredRowModel().rows.length;
  const { pageIndex } = table.state.pagination;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <InputGroup className="w-full max-w-xs bg-card">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder={searchPlaceholder}
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            aria-label="Search table"
          />
        </InputGroup>
        {toolbar}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader className="bg-muted/40">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id} className="h-10 text-xs font-medium text-muted-foreground">
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-foreground"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === "asc" ? <ArrowUp className="size-3" /> : sorted === "desc" ? <ArrowDown className="size-3" /> : null}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length}>
                  <Empty className="py-10">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Inbox />
                      </EmptyMedia>
                      <EmptyTitle>{globalFilter ? "No matches" : emptyTitle}</EmptyTitle>
                      {(globalFilter || emptyDescription) && (
                        <EmptyDescription>
                          {globalFilter ? `Nothing matches “${globalFilter}”.` : emptyDescription}
                        </EmptyDescription>
                      )}
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {filteredCount} result{filteredCount === 1 ? "" : "s"} · page {pageIndex + 1} of {table.getPageCount()}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
