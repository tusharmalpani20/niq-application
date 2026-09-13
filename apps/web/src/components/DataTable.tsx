import { tableFeatures, type ColumnDef, type RowData, useTable } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const features = tableFeatures({});

export type DataTableColumn<TData extends RowData> = ColumnDef<typeof features, TData>;

export function DataTable<TData extends RowData>({ columns, data, label = "Data table" }: { columns: Array<DataTableColumn<TData>>; data: TData[]; label?: string }) {
  const table = useTable({ features, columns, data });

  return <div className="overflow-x-auto">
    <Table aria-label={label}>
      <TableHeader>{table.getHeaderGroups().flatMap((headerGroup) => headerGroup.headers.map((header, index) => <TableHead id={header.id} isRowHeader={index === 0} key={header.id}>{header.isPlaceholder ? null : <table.FlexRender header={header} />}</TableHead>))}</TableHeader>
      <TableBody>{table.getRowModel().rows.map((row) => <TableRow id={row.id} key={row.id}>{row.getAllCells().map((cell) => <TableCell key={cell.id}><table.FlexRender cell={cell} /></TableCell>)}</TableRow>)}</TableBody>
    </Table>
  </div>;
}
