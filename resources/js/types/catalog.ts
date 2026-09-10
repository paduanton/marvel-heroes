export interface Character {
  id: number;
  name: string;
  description: string | null;
  modified_at: string | null;
  image_url: string | null;
}

export interface Story {
  id: number;
  title: string;
  type: string | null;
  modified_at: string | null;
  counts: { creators: number; characters: number; comics: number; events: number };
}

export interface Comic {
  id: number;
  digital_id: number | null;
  title: string;
  description: string | null;
  format: string | null;
  modified_at: string | null;
  on_sale_at: string | null;
  digital_price: number | null;
  image_url: string | null;
}

export interface PageMeta {
  page: number;
  per_page: number;
  total: number;
}

export interface ApiCollection<T> {
  data: T[];
  meta: PageMeta;
}

export interface ApiResource<T> {
  data: T;
}
