"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { useStore, useMyShift, useCan } from "@/lib/store";
import { Button, Field, Input, Modal, toast } from "./ui";

/** Payments are tied to a cashier shift. Shows a banner + opener when the current user has no open shift. */
export default function ShiftGate() {
  const shift = useMyShift();
  const can = useCan();
  const openShift = useStore((s) => s.openShift);
  const [open, setOpen] = useState(false);
  const [float, setFloat] = useState("15000");
  if (shift || !can("shifts.own")) return null;
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sun bg-sun-soft px-4 py-3">
        <div className="flex items-center gap-3 text-sm">
          <Wallet size={18} className="text-[#a37812]" />
          <span>
            <b>No shift open.</b> Open your shift with a cash float so today&apos;s payments are counted in your shift report.
          </span>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>Open shift</Button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Open cashier shift"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!(await openShift(Number(float) || 0))) return;
                setOpen(false);
                toast("Shift opened");
              }}
            >
              Open shift
            </Button>
          </>
        }
      >
        <Field label="Opening cash float (Rs.)" hint="Count the notes and coins in the drawer before you start.">
          <Input type="number" value={float} onChange={(e) => setFloat(e.target.value)} autoFocus />
        </Field>
      </Modal>
    </>
  );
}
