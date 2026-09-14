import { tableFeatures, type ColumnDef, type RowData, useTable } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const features = tableFeatures({});

export type DataTableColumn<TData extends RowData> = ColumnDef<typeof features, TData>;

export function DataTable<TData extends RowData>({ columns, data, label = "Data table", emptyContent }: { columns: Array<DataTableColumn<TData>>; data: TData[]; label?: string; emptyContent?: ReactNode }) {
  const table = useTable({ features, columns, data });
  const rows = table.getRowModel().rows;

  return <div className="overflow-x-auto">
    <Table aria-label={label}>
      <TableHeader>{table.getHeaderGroups().flatMap((headerGroup) => headerGroup.headers.map((header, index) => <TableHead id={header.id} isRowHeader={index === 0} key={header.id}>{header.isPlaceholder ? null : <table.FlexRender header={header} />}</TableHead>))}</TableHeader>
      <TableBody>{rows.length > 0 ? rows.map((row) => <TableRow id={row.id} key={row.id}>{row.getAllCells().map((cell) => <TableCell key={cell.id}><table.FlexRender cell={cell} /></TableCell>)}</TableRow>) : emptyContent ? <TableRow><TableCell className="p-0" colSpan={columns.length}>{emptyContent}</TableCell></TableRow> : null}</TableBody>
    </Table>
  </div>;
}
