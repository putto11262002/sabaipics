'use client';

import { useMemo, useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { cn } from '@/shared/utils/ui';
import { Button } from '@/shared/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group';
import { Separator } from '@/shared/components/ui/separator';

type Option = {
  value: string;
  label: string;
  disabled?: boolean;
};

function PopoverSelect({
  label,
  placeholder,
  value,
  onChange,
  options,
  searchPlaceholder,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  searchPlaceholder: string;
}) {
  const [open, setOpen] = useState(false);

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? '',
    [options, value],
  );

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            <span
              className={cn(
                'truncate',
                selectedLabel ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {selectedLabel || placeholder}
            </span>
            <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>Not found.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    data-checked={value === option.value}
                    onSelect={(currentValue) => {
                      onChange(currentValue);
                      setOpen(false);
                    }}
                  >
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

const canonGroup1Models: Option[] = [
  { value: 'eos-r1', label: 'EOS R1' },
  { value: 'eos-r5-mark-ii', label: 'EOS R5 Mark II' },
  { value: 'eos-r6-mark-ii', label: 'EOS R6 Mark II' },
  { value: 'eos-r6-mark-iii', label: 'EOS R6 Mark III' },
  { value: 'eos-r8', label: 'EOS R8' },
  { value: 'eos-r50', label: 'EOS R50' },
  { value: 'eos-r50-v', label: 'EOS R50 V' },
];

export function CameraGuideEntry() {
  const [brand, setBrand] = useState<string>('');
  const [canonModel, setCanonModel] = useState<string>('');

  const brandOptions: Option[] = [
    { value: 'canon', label: 'Canon' },
    { value: 'nikon', label: 'Nikon' },
    { value: 'sony', label: 'Sony' },
  ];

  const canContinue = brand === 'canon' ? Boolean(canonModel) : Boolean(brand);
  const nextHref =
    brand === 'canon'
      ? '/guides/canon/eos-utility'
      : brand === 'nikon'
        ? '/guides/nikon'
        : brand === 'sony'
          ? '/guides/sony'
          : '/guides';

  return (
    <div className="space-y-6">
      <RadioGroup
        value={brand}
        onValueChange={(value) => {
          setBrand(value);
          setCanonModel('');
        }}
        className="gap-3"
      >
        {brandOptions.map((option) => {
          const checked = brand === option.value;
          const id = `brand-${option.value}`;

          return (
            <label
              key={option.value}
              htmlFor={id}
              className={cn(
                'flex items-center justify-between gap-4 rounded-xl border p-4 transition-colors',
                checked
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border bg-background hover:bg-muted/40',
              )}
            >
              <div className="min-w-0">
                <div className="text-base font-semibold text-foreground">{option.label}</div>
              </div>
              <RadioGroupItem id={id} value={option.value} />
            </label>
          );
        })}
      </RadioGroup>

      {brand === 'canon' ? (
        <>
          <Separator />
          <PopoverSelect
            label="Select your Canon model"
            placeholder="Choose a model"
            value={canonModel}
            onChange={setCanonModel}
            options={canonGroup1Models}
            searchPlaceholder="Search Canon model..."
          />
        </>
      ) : null}

      <div className="flex justify-center">
        <Button asChild disabled={!canContinue} className="min-w-40">
          <Link href={nextHref}>Continue</Link>
        </Button>
      </div>
    </div>
  );
}
