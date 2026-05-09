import { events } from './bindings'

export function onSettingsSave() {
    events.configUpdatedEvent.emit()
}
