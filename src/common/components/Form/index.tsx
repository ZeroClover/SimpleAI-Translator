import React, { ReactElement, ReactNode } from 'react'
import { Field } from 'rc-field-form'
import { NamePath } from 'rc-field-form/es/interface'
import { FormControl } from 'baseui/form-control'
import styles from './index.module.css'

export { default as Form, useForm } from 'rc-field-form'

interface FormItemProps {
    name: NamePath
    label?: ReactNode
    caption?: ReactNode
    style?: React.CSSProperties
    children: ReactElement
}

// Binds a settings control to a form field and renders it with its label and caption.
export function FormItem({ name, label, caption, style, children }: FormItemProps) {
    return (
        <div className={styles.formItem} style={style}>
            <Field name={name}>
                {(control) => (
                    <FormControl
                        label={
                            <div style={{ flexShrink: 0, padding: '0.25em 0', fontSize: '1.2em', fontWeight: '600' }}>
                                {label}
                            </div>
                        }
                        caption={caption}
                    >
                        {React.cloneElement(children, control)}
                    </FormControl>
                )}
            </Field>
        </div>
    )
}
