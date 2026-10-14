import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface SearchInputProps {
  action: string
  defaultValue?: string
  placeholder?: string
  /** Extra hidden inputs to preserve in the form (e.g. status filter) */
  hiddenInputs?: Record<string, string>
}

export function SearchInput({ action, defaultValue = '', placeholder = 'Search...', hiddenInputs }: SearchInputProps) {
  return (
    <form action={action} method="GET" className="flex gap-2 mb-6">
      {hiddenInputs && Object.entries(hiddenInputs).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Input
        type="search"
        aria-label={placeholder}
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="max-w-sm"
      />
      <Button type="submit" variant="secondary">Search</Button>
    </form>
  )
}
