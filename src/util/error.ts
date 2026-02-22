import z from "zod/v4"

export type ErrorObject<Name extends string, Data> = { name: Name; data: Data }

export abstract class NamedError<Name extends string = string, Data = unknown> extends Error {
  declare readonly name: Name
  readonly data: Data

  constructor(data: Data, options?: ErrorOptions) {
    const msg = typeof data === "object" && data !== null && "message" in data
      ? String((data as { message: unknown }).message)
      : String(data)
    super(msg)
    this.data = data
    if (options?.cause) this.cause = options.cause
    Object.setPrototypeOf(this, new.target.prototype)
  }

  toObject(): ErrorObject<Name, Data> {
    return { name: this.name as Name, data: this.data }
  }

  static create<Name extends string, DataSchema extends z.ZodType>(
    name: Name,
    dataSchema: DataSchema,
  ): new (data: z.infer<DataSchema>, options?: ErrorOptions) => NamedError<Name, z.infer<DataSchema>> & {
    Name: Name
    Schema: z.ZodType<ErrorObject<Name, z.infer<DataSchema>>>
    isInstance(obj: unknown): obj is ErrorObject<Name, z.infer<DataSchema>>
  } {
    const Schema = z.object({
      name: z.literal(name),
      data: dataSchema,
    }) as z.ZodType<ErrorObject<Name, z.infer<DataSchema>>>

    class NamedErrorImpl extends NamedError<Name, z.infer<DataSchema>> {
      override readonly name = name
      static readonly Name = name
      static readonly Schema = Schema

      static isInstance(obj: unknown): obj is ErrorObject<Name, z.infer<DataSchema>> {
        return typeof obj === "object" && obj !== null && "name" in obj && (obj as { name: string }).name === name
      }
    }

    return NamedErrorImpl as never
  }

  static readonly Unknown = NamedError.create("Unknown", z.object({ message: z.string() }))
}
