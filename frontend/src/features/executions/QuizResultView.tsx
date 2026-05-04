interface QuizQuestion {
  reference_page: string;
  question: string;
  options: string[];
  answer: string;
  explanation: string;
  quality_warnings?: string[];
}

interface QuizJson {
  source_file: string;
  focus_area: string;
  generated_at: string;
  questions: QuizQuestion[];
}

interface Props {
  json: QuizJson;
  filePath?: string;
}

export function QuizResultView({ json, filePath }: Props) {
  if (!json?.questions) {
    return <pre>{JSON.stringify(json, null, 2)}</pre>;
  }
  const downloadHref = filePath
    ? `/api/files?path=${encodeURIComponent(filePath)}`
    : undefined;

  return (
    <div className="card" style={{ marginTop: '12px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>{json.questions.length} questions</h3>
          <p className="text-muted" style={{ margin: '4px 0 0', fontSize: '12px' }}>
            Source: {json.source_file} &middot; Focus: {json.focus_area} &middot; Generated: {new Date(json.generated_at).toLocaleString()}
          </p>
        </div>
        {downloadHref && (
          <a href={downloadHref} download className="btn btn-primary" style={{ fontSize: '13px', textDecoration: 'none' }}>
            Download JSON
          </a>
        )}
      </header>
      <ol style={{ paddingLeft: '20px', margin: 0 }}>
        {json.questions.map((q, idx) => (
          <li key={idx} style={{ marginBottom: '16px' }}>
            <p style={{ margin: '0 0 4px', fontSize: '13px' }}>
              <strong style={{ color: 'var(--accent-primary)' }}>{q.reference_page}</strong>
              {' — '}{q.question}
            </p>
            <ul style={{ paddingLeft: '16px', margin: '4px 0', fontSize: '12px' }}>
              {q.options.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
            <p style={{ margin: '4px 0', fontSize: '12px' }}>
              Answer: <strong style={{ color: '#22c55e' }}>{q.answer}</strong>
            </p>
            <p style={{ margin: '4px 0', fontSize: '12px', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
              {q.explanation}
            </p>
            {q.quality_warnings && q.quality_warnings.length > 0 && (
              <ul style={{ paddingLeft: '16px', margin: '4px 0', color: '#ef4444', fontSize: '11px' }}>
                {q.quality_warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
