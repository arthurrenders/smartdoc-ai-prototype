"use client"

import { useEffect, useState, useTransition, type FormEvent } from "react"
import { Building2, FileText, Shuffle, X as XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import {
  getPropertyMetadata,
  updatePropertyMetadata,
  type MetadataSources,
} from "@/app/actions/update-property-metadata"

type Props = {
  propertyId: string
}

type Metadata = {
  construction_year: number | null
  transaction_type: string | null
  heating_type: string | null
  property_type: string | null
  asking_price: number | null
  bedrooms: number | null
  living_area_m2: number | null
  description: string | null
}

const EMPTY: Metadata = {
  construction_year: null,
  transaction_type: null,
  heating_type: null,
  property_type: null,
  asking_price: null,
  bedrooms: null,
  living_area_m2: null,
  description: null,
}

type RandomFields = {
  transaction_type: "sale" | "rent"
  asking_price: number
  bedrooms: number
}

function randomDemoValues(currentPropertyType: string): RandomFields {
  const transactions = ["sale", "rent"] as const
  const pricesSale = [225_000, 285_000, 345_000, 410_000, 525_000, 680_000, 795_000]
  const pricesRent = [750, 950, 1_150, 1_350, 1_600, 1_950]
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)]
  const intBetween = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min

  const tx = pick(transactions)

  let bedrooms: number
  switch (currentPropertyType) {
    case "house":
      bedrooms = intBetween(2, 5)
      break
    case "apartment":
      bedrooms = intBetween(1, 3)
      break
    case "land":
    case "commercial":
      bedrooms = 0
      break
    default:
      bedrooms = intBetween(1, 4)
  }

  return {
    transaction_type: tx,
    asking_price: tx === "sale" ? pick(pricesSale) : pick(pricesRent),
    bedrooms,
  }
}

const DOC_ELIGIBLE_FIELDS = new Set([
  "construction_year",
  "heating_type",
  "property_type",
  "living_area_m2",
])

export function EditPropertyMetadataButton({ propertyId }: Props) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [metadata, setMetadata] = useState<Metadata>(EMPTY)
  const [sources, setSources] = useState<MetadataSources>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const [constructionYear, setConstructionYear] = useState<string>("")
  const [transactionType, setTransactionType] = useState<string>("")
  const [heatingType, setHeatingType] = useState<string>("")
  const [propertyType, setPropertyType] = useState<string>("")
  const [askingPrice, setAskingPrice] = useState<string>("")
  const [bedrooms, setBedrooms] = useState<string>("")
  const [livingAreaM2, setLivingAreaM2] = useState<string>("")

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setLoading(true)
    setError(null)
    getPropertyMetadata(propertyId).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setMetadata(result.metadata)
        setSources(result.sources)
        setConstructionYear(
          result.metadata.construction_year !== null ? String(result.metadata.construction_year) : "",
        )
        setTransactionType(result.metadata.transaction_type ?? "")
        setHeatingType(result.metadata.heating_type ?? "")
        setPropertyType(result.metadata.property_type ?? "")
        setAskingPrice(
          result.metadata.asking_price !== null ? String(result.metadata.asking_price) : "",
        )
        setBedrooms(result.metadata.bedrooms !== null ? String(result.metadata.bedrooms) : "")
        setLivingAreaM2(
          result.metadata.living_area_m2 !== null ? String(result.metadata.living_area_m2) : "",
        )
      } else {
        setError(result.error)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [isOpen, propertyId])

  function applyRandom() {
    const r = randomDemoValues(propertyType)
    setTransactionType(r.transaction_type)
    setAskingPrice(String(r.asking_price))
    setBedrooms(String(r.bedrooms))
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      const result = await updatePropertyMetadata(formData)
      if (result.ok) {
        setIsOpen(false)
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-white/40 bg-white px-3 py-2 text-sm font-medium text-primary shadow-sm transition-colors hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white/60 focus:ring-offset-2"
      >
        <Building2 className="h-4 w-4" aria-hidden />
        Pandgegevens
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-label="Pandgegevens bewerken"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false)
            }
          }}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Pandgegevens bewerken</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Velden met <span className="font-medium text-primary">Uit documenten</span> zijn
                  automatisch ingevuld op basis van de geanalyseerde attesten.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={applyRandom}
                  disabled={loading || isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-white px-3 py-1.5 text-xs font-medium text-primary shadow-sm transition-colors hover:bg-primary/10 disabled:opacity-50"
                  title="Vul transactie, vraagprijs en slaapkamers willekeurig in (overige velden komen uit de documenten)"
                >
                  <Shuffle className="h-3.5 w-3.5" aria-hidden />
                  Vul willekeurig in
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                  aria-label="Sluiten"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            {loading ? (
              <div className="px-5 py-8 text-sm text-muted-foreground">Laden…</div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4 overflow-y-auto px-5 py-5">
                <input type="hidden" name="propertyId" value={propertyId} />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    label="Pandtype"
                    htmlFor="property_type"
                    source={DOC_ELIGIBLE_FIELDS.has("property_type") ? sources.property_type : undefined}
                  >
                    <select
                      id="property_type"
                      name="property_type"
                      value={propertyType}
                      onChange={(e) => setPropertyType(e.target.value)}
                      className={selectClass}
                    >
                      <option value="">— niet ingevuld —</option>
                      <option value="house">Woning</option>
                      <option value="apartment">Appartement</option>
                      <option value="land">Grond</option>
                      <option value="commercial">Commercieel</option>
                      <option value="other">Anders</option>
                    </select>
                  </Field>

                  <Field label="Transactietype" htmlFor="transaction_type">
                    <select
                      id="transaction_type"
                      name="transaction_type"
                      value={transactionType}
                      onChange={(e) => setTransactionType(e.target.value)}
                      className={selectClass}
                    >
                      <option value="">— niet ingevuld —</option>
                      <option value="sale">Verkoop</option>
                      <option value="rent">Verhuur</option>
                    </select>
                  </Field>

                  <Field
                    label="Bouwjaar"
                    htmlFor="construction_year"
                    source={sources.construction_year}
                  >
                    <input
                      id="construction_year"
                      name="construction_year"
                      type="number"
                      min={1700}
                      max={2100}
                      value={constructionYear}
                      onChange={(e) => setConstructionYear(e.target.value)}
                      className={inputClass}
                    />
                  </Field>

                  <Field
                    label="Verwarmingstype"
                    htmlFor="heating_type"
                    source={sources.heating_type}
                  >
                    <select
                      id="heating_type"
                      name="heating_type"
                      value={heatingType}
                      onChange={(e) => setHeatingType(e.target.value)}
                      className={selectClass}
                    >
                      <option value="">— niet ingevuld —</option>
                      <option value="gas">Gas</option>
                      <option value="oil">Stookolie</option>
                      <option value="electric">Elektrisch</option>
                      <option value="heat_pump">Warmtepomp</option>
                      <option value="district">Stadsverwarming</option>
                      <option value="other">Anders</option>
                    </select>
                  </Field>

                  <Field label="Vraagprijs (€)" htmlFor="asking_price">
                    <input
                      id="asking_price"
                      name="asking_price"
                      type="number"
                      step="any"
                      min={0}
                      value={askingPrice}
                      onChange={(e) => setAskingPrice(e.target.value)}
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Slaapkamers" htmlFor="bedrooms">
                    <input
                      id="bedrooms"
                      name="bedrooms"
                      type="number"
                      min={0}
                      max={50}
                      value={bedrooms}
                      onChange={(e) => setBedrooms(e.target.value)}
                      className={inputClass}
                    />
                  </Field>

                  <Field
                    label="Bewoonbare oppervlakte (m²)"
                    htmlFor="living_area_m2"
                    source={sources.living_area_m2}
                  >
                    <input
                      id="living_area_m2"
                      name="living_area_m2"
                      type="number"
                      step="any"
                      min={0}
                      value={livingAreaM2}
                      onChange={(e) => setLivingAreaM2(e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                </div>

                <Field label="Omschrijving" htmlFor="description">
                  <textarea
                    id="description"
                    name="description"
                    rows={4}
                    maxLength={8000}
                    defaultValue={metadata.description ?? ""}
                    className={`${inputClass} resize-y`}
                    placeholder="Korte tekst voor portaal- en e-mailgebruik."
                  />
                </Field>

                {error && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    disabled={isPending}
                    className="saas-btn-secondary"
                  >
                    Annuleren
                  </button>
                  <button type="submit" disabled={isPending} className="saas-btn-primary">
                    {isPending ? "Opslaan…" : "Opslaan"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}

const inputClass =
  "w-full rounded-md border border-[hsl(var(--border))] bg-background px-3 py-2 text-sm shadow-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-ring focus:ring-offset-0"
const selectClass = inputClass

function Field({
  label,
  htmlFor,
  source,
  children,
}: {
  label: string
  htmlFor: string
  source?: "document" | "manual"
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {source === "document" && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
            title="Deze waarde is automatisch overgenomen uit een geanalyseerd document."
          >
            <FileText className="h-3 w-3" aria-hidden />
            Uit documenten
          </span>
        )}
      </div>
      {children}
    </div>
  )
}
