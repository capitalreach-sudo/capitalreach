interface Props {
  quote: string;
  attribution?: string;
}

export function PullQuote({ quote, attribution }: Props) {
  return (
    <figure className="pull-quote">
      <span className="pull-quote-mark" aria-hidden="true">“</span>
      <blockquote className="pull-quote-text">{quote}</blockquote>
      {attribution && <figcaption className="pull-quote-attribution">— {attribution}</figcaption>}
    </figure>
  );
}
