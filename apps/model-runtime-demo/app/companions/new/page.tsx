import Link from "next/link";

import { CompanionForm } from "../../companion-form";

export default function NewCompanionPage() {
  return (
    <main className="shell">
      <section className="panel">
        <div className="page-toolbar">
          <div className="heading">
            <span>Persona</span>
            <h1>新建伴侣</h1>
          </div>
          <Link className="secondary-button" href="/">
            返回列表
          </Link>
        </div>
        <CompanionForm />
      </section>
    </main>
  );
}
